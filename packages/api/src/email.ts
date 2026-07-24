import nodemailer from "nodemailer";
import { carregarConfig, type ConfigApi } from "./config.js";

export type EmailTexto = {
  readonly para: string;
  readonly assunto: string;
  readonly texto: string;
};

export type ResultadoEmail =
  | { readonly ok: true }
  | { readonly ok: false; readonly motivo: "smtp_nao_configurado" | "falha_envio" };

function smtpConfigurado(config: Pick<ConfigApi, "smtpFrom" | "smtpHost">): boolean {
  return config.smtpHost !== "" && config.smtpFrom !== "";
}

export async function enviarEmail(
  dados: EmailTexto,
  config: ConfigApi = carregarConfig(),
): Promise<ResultadoEmail> {
  if (!smtpConfigurado(config)) return { motivo: "smtp_nao_configurado", ok: false };

  try {
    const transport = nodemailer.createTransport({
      auth:
        config.smtpUser === ""
          ? undefined
          : {
              pass: config.smtpPass,
              user: config.smtpUser,
            },
      host: config.smtpHost,
      port: config.smtpPort,
      secure: config.smtpPort === 465,
    });

    await transport.sendMail({
      from: config.smtpFrom,
      subject: dados.assunto,
      text: dados.texto,
      to: dados.para,
    });
    return { ok: true };
  } catch {
    return { motivo: "falha_envio", ok: false };
  }
}
