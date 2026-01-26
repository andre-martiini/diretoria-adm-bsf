import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Login from './components/Login';
import Dashboard from './components/Dashboard';
import AnnualHiringPlan from './components/AnnualHiringPlan';
import PublicDashboard from './components/PublicDashboard';
import BudgetManagement from './components/BudgetManagement';

const App: React.FC = () => {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Login />} />
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/pca" element={<AnnualHiringPlan />} />
        <Route path="/transparencia" element={<PublicDashboard />} />
        <Route path="/gestao-orcamentaria" element={<BudgetManagement />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
};

export default App;
