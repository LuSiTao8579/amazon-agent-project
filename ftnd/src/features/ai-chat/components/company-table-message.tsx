'use client';

import { useState } from 'react';
import type { CompanyRow } from '../../../../../contracts/tool-result.d.ts';
import CompanyTableRow, { companyColumns } from '../../../components/company-table-row';
import ResultTable from './result-table';

export default function CompanyTableMessage({ companies, summary }: { companies: CompanyRow[]; summary: string }) {
  const [expanded, setExpanded] = useState<string[]>([]);
  return <ResultTable label="公司查询结果" summary={summary} columns={companyColumns}>
    {companies.map(company => {
      const code = company.companyCode;
      return <CompanyTableRow key={code} company={company} expanded={expanded.includes(code)}
        onToggle={() => setExpanded(current => current.includes(code) ? current.filter(id => id !== code) : [...current, code])} />;
    })}
  </ResultTable>;
}
