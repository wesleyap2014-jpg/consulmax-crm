import fs from "node:fs";
const file = "src/components/clientes/CustomerSuccessFinal.tsx";
let src = fs.readFileSync(file, "utf8");
src = src.replace(/<p className="text-sm text-slate-600">[\s\S]*?<\/p>(?=<button type="button")/, "");
src = src.replace(/<Hint>“Existe alguma informação sobre o seu consórcio[^<]*<\/Hint>/, '<Hint>“Antes de finalizarmos, quero aproveitar para perguntar uma coisa importante: existe alguma informação sobre o seu consórcio que ainda não esteja clara ou alguma coisa que tenha sido combinada com você e que você gostaria de confirmar conosco?”</Hint>');
fs.writeFileSync(file, src);
console.log("customer success final clean applied");
