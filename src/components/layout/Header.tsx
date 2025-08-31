export default function Header(){
  return (
    <header className="sticky top-0 z-10 bg-white/90 backdrop-blur shadow px-4 h-14 flex items-center justify-between">
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 rounded-full bg-consulmax-primary" />
        <div className="text-consulmax-secondary font-bold">Consulmax • <span className="text-consulmax-primary">Maximize as suas conquistas</span></div>
      </div>
    </header>
  )
}
