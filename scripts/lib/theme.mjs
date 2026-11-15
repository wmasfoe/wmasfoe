export const FONT =
  '"JetBrains Mono", "Cascadia Mono", "DejaVu Sans Mono", "Liberation Mono", ui-monospace, monospace';

export const CHAR_RATIO = 0.6;

export const themes = {
  light: {
    id: "light",
    bg: "#ffffff",
    border: "#d8dee4",
    title: "#9a3412",
    name: "#7c2d12",
    key: "#c2410c",
    value: "#1e3a8a",
    dot: "#d1d5db",
    muted: "#6b7280",
    section: "#0f766e",
    add: "#166534",
    del: "#b91c1c",
    cursor: "#c2410c",
    separator: "#e5e7eb",
    buttonBg: "#fff7ed",
    buttonBorder: "#fdba74",
    buttonText: "#9a3412",
    buttonIcon: "#c2410c",
    contrib: ["#ebedf0", "#9be9a8", "#40c463", "#30a14e", "#216e39"],
    legend: "#57606a",
  },
  dark: {
    id: "dark",
    bg: "#0d1117",
    border: "#30363d",
    title: "#fed7aa",
    name: "#ffedd5",
    key: "#fdba74",
    value: "#bfdbfe",
    dot: "#4b5563",
    muted: "#9ca3af",
    section: "#5eead4",
    add: "#86efac",
    del: "#fca5a5",
    cursor: "#fdba74",
    separator: "#30363d",
    buttonBg: "#1c1917",
    buttonBorder: "#9a3412",
    buttonText: "#ffedd5",
    buttonIcon: "#fdba74",
    contrib: ["#161b22", "#0e4429", "#006d32", "#26a641", "#39d353"],
    legend: "#8b949e",
  },
};

export const LEVEL_INDEX = {
  NONE: 0,
  FIRST_QUARTILE: 1,
  SECOND_QUARTILE: 2,
  THIRD_QUARTILE: 3,
  FOURTH_QUARTILE: 4,
};
