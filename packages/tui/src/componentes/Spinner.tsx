import React from "react";
import { Text } from "ink";
import { aurora } from "../tema.js";

const FRAMES = ["◜", "◝", "◞", "◟"];
const CORES = aurora.gradiente;

export function Spinner({ texto }: { texto: string }) {
  const [frame, setFrame] = React.useState(0);
  const [corIdx, setCorIdx] = React.useState(0);

  React.useEffect(() => {
    const id = setInterval(() => {
      setFrame((f) => (f + 1) % FRAMES.length);
      setCorIdx((c) => (c + 1) % CORES.length);
    }, 80);
    return () => clearInterval(id);
  }, []);

  return (
    <Text color={CORES[corIdx]}>
      {`${FRAMES[frame]} ${texto}`}
    </Text>
  );
}
