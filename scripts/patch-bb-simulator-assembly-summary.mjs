// Mantido por compatibilidade com o script de build.
// A tela BBConsorciosSimulator.tsx agora le diretamente config.assemblyResult
// e config.lanceOptions. O patch antigo injetava chamadas no componente durante
// o deploy e podia quebrar a build com latestAssemblySummary indefinido.

console.log("patch bb simulator assembly summary: skipped; handled in source");
