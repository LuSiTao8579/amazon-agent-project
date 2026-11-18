'use client';

import { useId, useState } from 'react';
import { Button, Stack, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Typography } from '@mui/material';
import type { CompanyRow } from '../../../../../contracts/tool-result.d.ts';
import RevenuePerEmployeeChip from '../../../components/revenue-per-employee-chip';

function ExpandableCompany({ company }: { company: CompanyRow }) {
  const [expanded, setExpanded] = useState(false);
  const detailsId = useId();
  return <>
    <TableRow>
      <TableCell><Button size="small" aria-expanded={expanded} aria-controls={detailsId}
        aria-label={`${expanded ? '收起' : '展开'} ${company.companyName}`} onClick={() => setExpanded(value => !value)}>
        {expanded ? '收起' : '展开'}
      </Button></TableCell>
      <TableCell component="th" scope="row">{company.companyName}</TableCell>
      <TableCell>{company.level}</TableCell><TableCell>{company.country}</TableCell>
      <TableCell><RevenuePerEmployeeChip value={company.revenuePerEmployee} /></TableCell>
    </TableRow>
    <TableRow id={detailsId} sx={{ display: expanded ? 'table-row' : 'none' }}>
      <TableCell colSpan={5}><Stack spacing={0.5}>
        <Typography>城市：{company.city}</Typography>
        <Typography>成立年份：{company.foundedYear}</Typography>
        <Typography>年营收：{company.annualRevenue}</Typography>
        <Typography>员工数量：{company.employees}</Typography>
      </Stack></TableCell>
    </TableRow>
  </>;
}

export default function CompanyTableMessage({ companies, summary }: { companies: CompanyRow[]; summary?: string }) {
  return <Stack spacing={1}>
    <Typography variant="body2">{summary}</Typography>
    <TableContainer><Table size="small" aria-label="公司查询结果">
      <TableHead><TableRow>{['详情', '名称', '等级', '国家', '人均年营收'].map(label =>
        <TableCell key={label}>{label}</TableCell>)}</TableRow></TableHead>
      <TableBody>{companies.map(company => <ExpandableCompany key={company.companyCode} company={company} />)}</TableBody>
    </Table></TableContainer>
  </Stack>;
}
