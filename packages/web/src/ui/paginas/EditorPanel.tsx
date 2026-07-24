interface EditorPanelProps {
  code: string;
  onChange: (val: string) => void;
}

export function EditorPanel({ code, onChange }: EditorPanelProps) {
  return (
    <textarea
      className="playground__editor"
      value={code}
      onChange={(e) => onChange(e.target.value)}
      spellCheck={false}
      aria-label="Editor de código"
    />
  );
}