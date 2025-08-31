import Header from '@/components/layout/Header'
import Sidebar from '@/components/layout/Sidebar'
import { Outlet } from 'react-router-dom'

export default function App(){
  return (
    <div className="min-h-screen">
      <Header/>
      <div className="flex">
        <Sidebar/>
        <main className="flex-1 p-4">
          <Outlet/>
        </main>
      </div>
    </div>
  )
}
