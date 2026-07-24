// @ts-nocheck — dynamic imports de Ink/React, sem JSX no tsconfig da CLI
/**
 * TUI runtime: conecta o provider com a interface Ink (React).
 * Import dinâmico para não puxar Ink/React no bundle principal da CLI.
 */
import { criarProviderRuntime, type ProviderRuntimeContext } from "./provider-runtime.js";

export async function iniciarTui(context: ProviderRuntimeContext): Promise<void> {
  const provider = await criarProviderRuntime(context);
  // Dynamic import — Ink é ~30MB e só carrega no modo TUI.
  const [{ App }, ink] = await Promise.all([
    import("@codingpro/tui") as Promise<{ App: any }>,
    import("ink") as Promise<{ render: any }>,
  ]);

  const { waitUntilExit } = ink.render(
    App({
      tema: "aurora",
      async onSend(prompt: string) {
        let content = "";
        const stream = provider.stream({ messages: [{ role: "user", content: prompt }], toolChoice: "none" });
        for await (const event of stream) {
          if (event.type === "text-delta") content += event.text;
          else if (event.type === "finish") return [{ role: "assistant", content: content || "(sem resposta)" }];
        }
        return [{ role: "assistant", content: content || "(sem resposta)" }];
      },
    }),
    { exitOnCtrlC: true, patchConsole: false },
  );

  await waitUntilExit;
}
