/**
 * Página "em breve" do P0. Cores = tema Aurora da CLI
 * (esmeralda → ciano → violeta), para o site já nascer com a mesma identidade.
 */
export const PAGINA_EM_BREVE = `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>CodingPro — em breve</title>
<meta name="description" content="CodingPro: CLI de desenvolvimento assistido por IA, em português. Plataforma web em construção.">
<style>
  :root { color-scheme: dark; }
  * { box-sizing: border-box; }
  body {
    margin: 0; min-height: 100vh; display: grid; place-items: center; padding: 2rem;
    background: radial-gradient(120% 120% at 50% 0%, #0d1b1a 0%, #0a0a0f 60%);
    color: #e6e6ec;
    font: 400 16px/1.6 ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
  }
  main { max-width: 34rem; text-align: center; }
  h1 {
    font-size: clamp(2.5rem, 9vw, 4rem); margin: 0 0 .5rem; letter-spacing: -.03em;
    background: linear-gradient(100deg, #10b981, #06b6d4 55%, #8b5cf6);
    -webkit-background-clip: text; background-clip: text; color: transparent;
  }
  .selo {
    display: inline-block; margin-bottom: 1.75rem; padding: .3rem .8rem; border-radius: 999px;
    font-size: .78rem; letter-spacing: .08em; text-transform: uppercase;
    border: 1px solid rgba(6,182,212,.35); background: rgba(6,182,212,.08); color: #67e8f9;
  }
  p { margin: 0 0 1rem; color: #b4b4c0; }
  code {
    font-family: ui-monospace, "JetBrains Mono", "Fira Code", monospace; font-size: .9em;
    padding: .15em .45em; border-radius: .35rem;
    background: rgba(255,255,255,.06); color: #a7f3d0;
  }
  footer { margin-top: 2.5rem; font-size: .85rem; color: #6b6b78; }
  a { color: #34d399; text-decoration: none; }
  a:hover { text-decoration: underline; }
</style>
</head>
<body>
<main>
  <span class="selo">Em construção</span>
  <h1>CodingPro</h1>
  <p>Desenvolvimento assistido por IA no terminal, <strong>em português</strong>.</p>
  <p>A plataforma web — contas, limites e uso <em>sem chave própria</em> — está sendo construída.</p>
  <p>A CLI já funciona hoje: <code>npm i -g codingpro</code></p>
  <footer>
    <a href="https://github.com/alvaro209890/CodingPro">github.com/alvaro209890/CodingPro</a>
  </footer>
</main>
</body>
</html>
`;
