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
    <div className="playground__dropdown" role="listbox" aria-label="Sugestões de comandos slash">
      <div className="playground__dropdownHeader">
        <span>⚡ Slash Commands ({matches.length})</span>
        <kbd>Tab / Enter para escolher</kbd>
      </div>
      <div className="playground__dropdownList">
        {matches.map((c, index) => (
          <div
            key={c.cmd}
            className={`playground__dropdownItem ${index === 0 ? "playground__dropdownItem-active" : ""}`}
            role="option"
            tabIndex={0}
            onClick={() => {
              onSelect(c.cmd.split(" ")[0] ?? "", currentInput);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onSelect(c.cmd.split(" ")[0] ?? "", currentInput);
              }
            }}
          >
            <div className="playground__dropdownCmdBadge">
              <code>{c.cmd}</code>
            </div>
            <span className="playground__dropdownDesc">{c.desc}</span>
          </div>
        ))}
      </div>
    </div>
  );
}