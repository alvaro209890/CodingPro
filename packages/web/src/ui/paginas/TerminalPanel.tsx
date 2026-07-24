interface TerminalPanelProps {
  output: string;
  cmd: string;
  onCmdChange: (val: string) => void;
  onRun: () => void;
  cmdRef: RefObject<HTMLInputElement | null>;
}

export function TerminalPanel({
  output,
  cmd,
  onCmdChange,
  onRun,
  cmdRef,
}: TerminalPanelProps) {
  return (
    <div className="playground__terminal">
      <div className="playground__terminalOutput">{output || "▸ _"}</div>
      <div className="playground__terminalInput">
        <span className="playground__terminalPrompt">$</span>
        <input
          ref={cmdRef}
          value={cmd}
          onChange={(e) => onCmdChange(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") onRun(); }}
          placeholder="comando..."
          className="playground__terminalInputField"
          aria-label="Terminal command input"
        />
      </div>
    </div>
  );
}