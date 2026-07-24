const BANNER = `
 ╔══════════════════════════════════════╗
 ║   ___      _ _    _   ___           ║
 ║  / __|___ |_| |__| |_| _ \\_ _ ___   ║
 ║ | (__/ _ \\\\| | / _\` | ||  _/ '_/ _\\\\  ║
 ║  \\\\___\\\\___// |\\\\__,_|\\\\__|_| |_| \\\\___/  ║
 ║          |__/                        ║
 ║  CLI local · DeepSeek V4 Pro/Flash   ║
 ╚══════════════════════════════════════╝`;

export function Banner() {
  return (
    <div className="playground__banner">
      <pre>{BANNER}</pre>
      <div className="playground__bannerTitle">Bem-vindo ao CodingPro CLI</div>
      <div className="playground__bannerHint">
        Digite <kbd>/</kbd> para comandos ·{" "}
        <kbd>Ctrl+N</kbd> novo chat ·{" "}
        <kbd>Ctrl+K</kbd> chats
      </div>
    </div>
  );
}