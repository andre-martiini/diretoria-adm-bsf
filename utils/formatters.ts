
import React from 'react';
import { Category } from '../types';

export const formatCurrency = (value: number): string => {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
};

export const formatDate = (dateString: string): string => {
  if (!dateString) return '-';
  // Se for ISO (contém T ou -)
  try {
    const cleanDate = dateString.split('T')[0];
    const parts = cleanDate.split('-');
    if (parts.length === 3) {
      return `${parts[2]}/${parts[1]}/${parts[0]}`;
    }
  } catch (e) {
    console.error("Erro ao formatar data:", dateString);
  }
  return dateString;
};

export const getCategoryColor = (cat: Category): string => {
  switch (cat) {
    case Category.Bens: return 'bg-emerald-50 text-emerald-700 border-emerald-200';
    case Category.TIC: return 'bg-blue-50 text-blue-700 border-blue-200';
    case Category.Servicos: return 'bg-amber-50 text-amber-700 border-amber-200';
    case Category.Obras: return 'bg-indigo-50 text-indigo-700 border-indigo-200';
    default: return 'bg-slate-50 text-slate-700 border-slate-200';
  }
};

export const getCategoryIcon = (cat: Category): string => {
  switch (cat) {
    case Category.Bens: return 'Package';
    case Category.TIC: return 'Cpu';
    case Category.Servicos: return 'Briefcase';
    default: return 'HelpCircle';
  }
};
