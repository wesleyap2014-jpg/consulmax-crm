export default function LiquidBG({ className = "" }: { className?: string }) {
  return (
    <div className={`liquid-bg ${className}`}>
      <span className="blob b1" />
      <span className="blob b2" />
      <span className="gold" />
    </div>
  )
}
