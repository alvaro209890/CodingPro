import type { ReactNode } from "react";

interface Cmd {
  cmd: string;
  desc: string;
}

interface SlashDropdownProps {
  filter: string;
  commands: Cmd[];
  onSelect: (cmd: string, fullInput: string) => void;
  currentInput: string;
}

export function SlashDropdown({ filter, commands, onSelect, currentInput }: SlashDropdownProps) {
  const prefix = filter.split(" ")[0] ?? "";
  const matches = commands.filter((c) => c.cmd.startsWith(prefix));
  if (matches.length === 0) return null;

  return (
    <div className="playground__dropdown" role="listbox">
      {matches.map((c) => (
        <div
          key={c.cmd}
          className="playground__dropdownItem"
          role="option"
          tabIndex={0}
          onClick={() => {
            onSelect(c.cmd.split(" ")[0] ?? "", currentInput);
          }}
          onKeyDown={(e) => { if (e.key === "Enter") onSelect(c.cmd.split(" ")[0] ?? "", currentInput); }}
        >
          <span className="playground__dropdownCmd">{c.cmd}</span>
          <span className="playground__dropdownDesc">{c.desc}</span>
        </div>
      ))}
    </div>
  );
}