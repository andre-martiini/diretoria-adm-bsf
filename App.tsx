import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Login from './components/Login';
import Dashboard from './components/Dashboard';
import PublicDashboard from './components/PublicDashboard';
import BudgetManagement from './components/BudgetManagement';
import { SIPACImporter } from './components/SIPACImporter';
import Tools from './components/Tools';
import CatmatSearch from './components/Catmat/CatmatSearch';
import DfdTool from './components/DfdTool';
import PriceMapCreator from './components/PriceMapCreator';
import CLCExecutionDashboard from './components/CLCExecutionDashboard';
import HiringManagementModule from './components/HiringManagementModule';

const App: React.FC = () => {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Login />} />
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/gestao-contratacoes" element={<Navigate to="/gestao-contratacoes/pca" replace />} />
        <Route path="/gestao-contratacoes/:tab" element={<HiringManagementModule />} />
        <Route path="/pca" element={<Navigate to="/gestao-contratacoes/pca" replace />} />
        <Route path="/transparencia" element={<PublicDashboard />} />
        <Route path="/gestao-orcamentaria" element={<BudgetManagement />} />
        <Route path="/execucao-clc" element={<CLCExecutionDashboard />} />
        <Route path="/extrator-sipac" element={<SIPACImporter />} />
        <Route path="/sipac" element={<Navigate to="/extrator-sipac" replace />} />
        <Route path="/ferramentas" element={<Tools />} />
        <Route path="/catmat" element={<CatmatSearch />} />
        <Route path="/dfd" element={<DfdTool />} />
        <Route path="/mapa-precos" element={<PriceMapCreator />} />
        <Route path="/licitacoes-governo" element={<Navigate to="/gestao-contratacoes/contratacoes" replace />} />
        <Route path="/contratos-empenhos-governo" element={<Navigate to="/gestao-contratacoes/contratos-empenhos" replace />} />

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
};

export default App;
