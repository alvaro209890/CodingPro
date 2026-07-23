import React from "react";
import { Text } from "ink";
import { aurora } from "../tema.js";

export function Banner() {
  return (
    <Text>
      <Text color={aurora.primario}>⬡ CodingPro</Text>
      <Text dimColor> — CLI de código assistida por IA</Text>
    </Text>
  );
}
