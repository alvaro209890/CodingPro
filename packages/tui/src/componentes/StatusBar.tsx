import React from "react";
import { Text } from "ink";

export function StatusBar({
  modelo,
  cache,
  custo,
  passos,
}: {
  modelo: string;
  cache?: number | undefined;
  custo?: string | undefined;
  passos: number;
}) {
  return (
    <Text dimColor>
      {`⬡ ${modelo} · cache ${cache ?? 0}% · ${custo ?? "—"} · ${passos} passos`}
    </Text>
  );
}
