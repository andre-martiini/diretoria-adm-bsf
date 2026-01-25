import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Login from './components/Login';
import Dashboard from './components/Dashboard';
import AnnualHiringPlan from './components/AnnualHiringPlan';
import PublicAnnualHiringPlan from './components/PublicAnnualHiringPlan';

const App: React.FC = () => {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Login />} />
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/pca" element={<AnnualHiringPlan />} />
        <Route path="/transparencia-pca" element={<PublicAnnualHiringPlan />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
};

export default App;
