import fs from "node:fs";
const file="src/pages/Clientes.tsx";
let src=fs.readFileSync(file,"utf8");
const tabs='import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";';
if(!src.includes('ClienteCadastroSimplificado from')) src=src.replace(tabs,tabs+'\nimport ClienteCadastroSimplificado from "@/components/clientes/ClienteCadastroSimplificado";');
src=src.replace('          data_nascimento: latest?.nasc || null,','          data_nascimento: arr.find((x) => !!x.nasc)?.nasc || null,');
fs.writeFileSync(file,src);
console.log('[clientes-cadastro] base aplicada');
