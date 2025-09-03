// src/App.tsx
import { Outlet } from "react-router-dom";

export default function App() {
  // Deixa o layout original cuidar do header/Sidebar.
  // Aqui só renderizamos as páginas filhas.
  return <Outlet />;
}
