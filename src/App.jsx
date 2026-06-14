import React from 'react'
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom'
import UserPage from './components/UserPage'
import AdminPage from './components/AdminPage'

function App() {
  return (
    <Router>
      <div className="app-container">
        <Routes>
          <Route path="/" element={<UserPage />} />
          <Route path="/admin" element={<AdminPage />} />
        </Routes>
      </div>
    </Router>
  )
}

export default App
