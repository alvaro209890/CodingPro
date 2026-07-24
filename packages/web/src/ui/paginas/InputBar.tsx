import type { RefObject } from "react";

interface InputBarProps {
  input: string;
  onInput: (val: string) => void;
  onSend: () => void;
  onKeyDown: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void;
  loading: boolean;
  textareaRef: RefObject<HTMLTextAreaElement | null>;
  placeholder?: string;
  showDropdown?: boolean;
}

export function InputBar({
  input,
  onInput,
  onSend,
  onKeyDown,
  loading,
  textareaRef,
  placeholder = "O que você quer criar, corrigir ou analisar?",
  showDropdown = false,
}: InputBarProps) {
  return (
    <div className="playground__inputArea">
      <span className="playground__prompt">▸</span>
      <textarea
        ref={textareaRef as RefObject<HTMLTextAreaElement>}
        value={input}
        onChange={(e) => onInput(e.target.value)}
        onKeyDown={onKeyDown}
        placeholder={placeholder}
        rows={1}
        className="playground__textarea"
        onInput={(e) => {
          const t = e.target as HTMLTextAreaElement;
          t.style.height = "auto";
          t.style.height = `${Math.min(t.scrollHeight, 120)}px`;
        }}
      />
      <button onClick={onSend} disabled={loading || !input.trim()} type="button">
        ▶
      </button>
      {showDropdown && (
        <div className="playground__dropdown-anchor">
          {/* placeholder for dropdown positioning */}
        </div>
      )}
    </div>
  );
}
