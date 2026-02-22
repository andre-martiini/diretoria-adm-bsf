import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Login from './components/Login';
import Dashboard from './components/Dashboard';
import AnnualHiringPlan from './components/AnnualHiringPlan';
import PublicDashboard from './components/PublicDashboard';
import BudgetManagement from './components/BudgetManagement';
import { SIPACImporter } from './components/SIPACImporter';
import Tools from './components/Tools';
import CatmatSearch from './components/Catmat/CatmatSearch';
import DfdTool from './components/DfdTool';
import PriceMapCreator from './components/PriceMapCreator';

const App: React.FC = () => {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Login />} />
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/pca" element={<AnnualHiringPlan />} />
        <Route path="/transparencia" element={<PublicDashboard />} />
        <Route path="/gestao-orcamentaria" element={<BudgetManagement />} />
        <Route path="/sipac" element={<SIPACImporter />} />
        <Route path="/ferramentas" element={<Tools />} />
        <Route path="/catmat" element={<CatmatSearch />} />
        <Route path="/dfd" element={<DfdTool />} />
        <Route path="/mapa-precos" element={<PriceMapCreator />} />

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
};

export default App;
