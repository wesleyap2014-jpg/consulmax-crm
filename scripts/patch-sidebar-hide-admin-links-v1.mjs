import fs from "node:fs";

const file = "src/components/layout/Sidebar.tsx";
let src = fs.readFileSync(file, "utf8");

src = src.replace('          { to: "/parametros", label: "Parâmetros", icon: SlidersHorizontal, end: true },\n', "");
src = src.replace('          { to: "/robos/area-restrita-maggi", label: "Robô Área Restrita", icon: Bot, onlyForWesley: true, end: true },\n', "");

fs.writeFileSync(file, src);
console.log("[sidebar] links Parâmetros e Robô Área Restrita ocultados");
