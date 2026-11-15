import fs from "node:fs";
import path from "node:path";

const USER_AGENT = "wmasfoe-profile-card";

async function graphql(token, query, variables = {}) {
  const response = await fetch("https://api.github.com/graphql", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "User-Agent": USER_AGENT,
    },
    body: JSON.stringify({ query, variables }),
    signal: AbortSignal.timeout(60_000),
  });
  const body = await response.json().catch(() => null);
  if (!response.ok || !body || body.errors) {
    const detail = body?.errors?.map((error) => error.message).join("; ") || response.statusText;
    throw new Error(`GraphQL ${response.status}: ${detail}`);
  }
  return body.data;
}

async function rest(token, apiPath) {
  const response = await fetch(`https://api.github.com${apiPath}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "User-Agent": USER_AGENT,
      "X-GitHub-Api-Version": "2022-11-28",
    },
    signal: AbortSignal.timeout(60_000),
  });
  const text = await response.text();
  let body = null;
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      body = text;
    }
  }
  return { status: response.status, body };
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function mapPool(items, limit, fn) {
  const results = new Array(items.length);
  let next = 0;
  async function worker() {
    for (;;) {
      const index = next;
      next += 1;
      if (index >= items.length) return;
      results[index] = await fn(items[index], index);
    }
  }
  const workers = Math.min(limit, items.length);
  await Promise.all(Array.from({ length: workers }, () => worker()));
  return results;
}

function reposQuery(includePrivate) {
  const privacy = includePrivate ? "" : ", privacy: PUBLIC";
  return `
    query($login: String!, $cursor: String) {
      user(login: $login) {
        databaseId
        createdAt
        followers { totalCount }
        repositories(
          first: 100
          after: $cursor
          ownerAffiliations: OWNER
          isFork: false
          ${privacy}
        ) {
          totalCount
          pageInfo { hasNextPage endCursor }
          nodes {
            nameWithOwner
            stargazerCount
            pushedAt
            isPrivate
            diskUsage
            defaultBranchRef { name }
          }
        }
        repositoriesContributedTo(
          first: 1
          includeUserRepositories: false
          contributionTypes: [COMMIT, PULL_REQUEST, ISSUE]
          ${privacy}
        ) {
          totalCount
        }
      }
    }
  `;
}

async function fetchOwner(token, login, includePrivate) {
  const query = reposQuery(includePrivate);
  const repos = [];
  let cursor = null;
  let createdAt = null;
  let databaseId = null;
  let followers = 0;
  let contributed = 0;
  for (;;) {
    const data = await graphql(token, query, { login, cursor });
    const user = data.user;
    if (!user) throw new Error(`GitHub user ${login} was not found`);
    createdAt = user.createdAt;
    databaseId = user.databaseId;
    followers = user.followers.totalCount;
    contributed = user.repositoriesContributedTo.totalCount;
    for (const repo of user.repositories.nodes) {
      if (repo) repos.push(repo);
    }
    if (!user.repositories.pageInfo.hasNextPage) break;
    cursor = user.repositories.pageInfo.endCursor;
  }
  repos.sort((a, b) => a.nameWithOwner.localeCompare(b.nameWithOwner));
  return { createdAt, databaseId, followers, contributed, repos };
}

export function commitRanges(createdAt, now = new Date()) {
  const ranges = [];
  let from = new Date(createdAt);
  const end = new Date(now);
  while (from < end) {
    const to = new Date(from);
    to.setUTCFullYear(to.getUTCFullYear() + 1);
    to.setTime(to.getTime() - 1000);
    if (to > end) to.setTime(end.getTime());
    if (to <= from) break;
    ranges.push({ from: from.toISOString(), to: to.toISOString() });
    from = new Date(to.getTime() + 1000);
  }
  return ranges;
}

async function fetchCommits(token, login, createdAt, includePrivate, now) {
  const ranges = commitRanges(createdAt, now);
  const fields = ranges
    .map((range, index) => {
      const extra = includePrivate
        ? `
          commitContributionsByRepository(maxRepositories: 100) {
            repository { isPrivate }
            contributions(first: 1) { totalCount }
          }
        `
        : "";
      return `
        r${index}: contributionsCollection(from: "${range.from}", to: "${range.to}") {
          totalCommitContributions
          ${extra}
        }
      `;
    })
    .join("\n");
  const data = await graphql(token, `query($login: String!) { user(login: $login) { ${fields} } }`, { login });
  let commits = 0;
  let privateCommits = 0;
  for (let index = 0; index < ranges.length; index += 1) {
    const slice = data.user[`r${index}`];
    commits += slice.totalCommitContributions || 0;
    if (includePrivate) {
      for (const row of slice.commitContributionsByRepository ?? []) {
        if (row.repository?.isPrivate) privateCommits += row.contributions?.totalCount || 0;
      }
    }
  }
  return commits + privateCommits;
}

async function fetchCalendar(token, login) {
  const data = await graphql(
    token,
    `query($login: String!) {
      user(login: $login) {
        contributionsCollection {
          contributionCalendar {
            totalContributions
            weeks {
              contributionDays {
                contributionCount
                contributionLevel
                weekday
              }
            }
          }
        }
      }
    }`,
    { login },
  );
  const calendar = data.user.contributionsCollection.contributionCalendar;
  return {
    total: calendar.totalContributions,
    weeks: calendar.weeks.map((week) => ({
      days: week.contributionDays.map((day) => ({
        count: day.contributionCount,
        level: day.contributionLevel,
        weekday: day.weekday,
      })),
    })),
  };
}

function readCache(file) {
  try {
    const parsed = JSON.parse(fs.readFileSync(file, "utf8"));
    if (!parsed || typeof parsed.repos !== "object" || parsed.repos == null) return { repos: {} };
    return { repos: parsed.repos };
  } catch {
    return { repos: {} };
  }
}

function writeCache(file, cache) {
  const repos = {};
  for (const name of Object.keys(cache.repos).sort()) repos[name] = cache.repos[name];
  const next = `${JSON.stringify({ repos }, null, 2)}\n`;
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const previous = fs.existsSync(file) ? fs.readFileSync(file, "utf8") : "";
  if (previous !== next) fs.writeFileSync(file, next);
}

async function linesForRepo(token, repo, userId) {
  const apiPath = `/repos/${repo.nameWithOwner}/stats/contributors`;
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const { status, body } = await rest(token, apiPath);
    if (status === 200 && Array.isArray(body)) {
      const mine = body.find((entry) => entry.author && entry.author.id === userId);
      if (!mine) return { additions: 0, deletions: 0 };
      let additions = 0;
      let deletions = 0;
      for (const week of mine.weeks ?? []) {
        additions += week.a || 0;
        deletions += week.d || 0;
      }
      return { additions, deletions };
    }
    if (status === 202 || status === 204) {
      await sleep(2000 + attempt * 1500);
      continue;
    }
    if (status === 404 || status === 451 || status === 409) return { additions: 0, deletions: 0 };
    if (status === 401 || status === 403) {
      const message = body && typeof body === "object" ? body.message : status;
      throw new Error(`GitHub denied stats for ${repo.isPrivate ? "a private repo" : repo.nameWithOwner} (${status}: ${message})`);
    }
    throw new Error(`Stats request failed for ${repo.isPrivate ? "a private repo" : repo.nameWithOwner} (${status})`);
  }
  return null;
}

async function fetchLines({ token, userId, repos, publicCachePath, privateCachePath }) {
  const publicCache = readCache(publicCachePath);
  const privateCache = readCache(privateCachePath);
  const nextPublic = { repos: {} };
  const nextPrivate = { repos: {} };
  let fetched = 0;
  let cached = 0;

  await mapPool(repos, 3, async (repo) => {
    const bucket = repo.isPrivate ? nextPrivate : nextPublic;
    const previous = (repo.isPrivate ? privateCache : publicCache).repos[repo.nameWithOwner];
    const empty = !repo.defaultBranchRef || repo.diskUsage === 0;
    if (empty) {
      bucket.repos[repo.nameWithOwner] = { pushedAt: repo.pushedAt, additions: 0, deletions: 0 };
      return;
    }
    if (previous && previous.pushedAt === repo.pushedAt && !previous.pending) {
      bucket.repos[repo.nameWithOwner] = {
        pushedAt: repo.pushedAt,
        additions: previous.additions || 0,
        deletions: previous.deletions || 0,
      };
      cached += 1;
      return;
    }
    const fresh = await linesForRepo(token, repo, userId);
    fetched += 1;
    if (!fresh) {
      if (previous) {
        bucket.repos[repo.nameWithOwner] = previous;
        console.log(`kept cached lines for ${repo.isPrivate ? "a private repo" : repo.nameWithOwner}`);
      }
      return;
    }
    bucket.repos[repo.nameWithOwner] = {
      pushedAt: repo.pushedAt,
      additions: fresh.additions,
      deletions: fresh.deletions,
    };
    if (!repo.isPrivate) {
      console.log(`lines ${repo.nameWithOwner}: +${fresh.additions} -${fresh.deletions}`);
    }
  });

  writeCache(publicCachePath, nextPublic);
  if (privateCachePath) writeCache(privateCachePath, nextPrivate);

  let additions = 0;
  let deletions = 0;
  for (const entry of Object.values(nextPublic.repos)) {
    additions += entry.additions || 0;
    deletions += entry.deletions || 0;
  }
  for (const entry of Object.values(nextPrivate.repos)) {
    additions += entry.additions || 0;
    deletions += entry.deletions || 0;
  }
  console.log(
    `lines of code: ${repos.length} repos, ${cached} cached, ${fetched} fetched, +${additions} -${deletions}`,
  );
  return { additions, deletions };
}

export async function fetchStats({
  token,
  includePrivate,
  login,
  now = new Date(),
  publicCachePath,
  privateCachePath,
}) {
  console.log(
    includePrivate
      ? `fetching GitHub stats for ${login} with STATS_TOKEN`
      : `fetching GitHub stats for ${login} with GITHUB_TOKEN (public data)`,
  );
  const owner = await fetchOwner(token, login, includePrivate);
  const [commits, calendar, lines] = await Promise.all([
    fetchCommits(token, login, owner.createdAt, includePrivate, now),
    fetchCalendar(token, login),
    fetchLines({
      token,
      userId: owner.databaseId,
      repos: owner.repos,
      publicCachePath,
      privateCachePath: includePrivate ? privateCachePath : null,
    }),
  ]);
  const stars = owner.repos.reduce((sum, repo) => sum + (repo.stargazerCount || 0), 0);
  return {
    createdAt: owner.createdAt,
    followers: owner.followers,
    contributed: owner.contributed,
    repos: owner.repos.length,
    stars,
    commits,
    additions: lines.additions,
    deletions: lines.deletions,
    calendar,
    includePrivate,
  };
}
