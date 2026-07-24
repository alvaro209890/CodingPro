interface GitPanelProps {
  gitUrl: string;
  gitOut: string;
  onUrlChange: (val: string) => void;
  onClone: () => void;
  onAction: (action: string) => void;
}

export function GitPanel({ gitUrl, gitOut, onUrlChange, onClone, onAction }: GitPanelProps) {
  return (
    <div className="playground__git">
      <div className="playground__gitInput">
        <input
          value={gitUrl}
          onChange={(e) => onUrlChange(e.target.value)}
          placeholder="https://github.com/user/repo.git"
          aria-label="Git repository URL"
        />
        <button onClick={onClone} type="button">Clone</button>
      </div>
      <div className="playground__gitButtons">
        {["status", "pull", "log"].map((a) => (
          <button key={a} onClick={() => onAction(a)} type="button">{a}</button>
        ))}
      </div>
      <pre className="playground__gitOutput">{gitOut || "output do git..."}</pre>
    </div>
  );
}