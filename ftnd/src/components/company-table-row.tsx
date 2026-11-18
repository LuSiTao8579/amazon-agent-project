'use client';

import { useId, type ReactNode } from 'react';
import { Button, Stack, TableCell, TableRow, Typography } from '@mui/material';
import type { CompanyRow } from '../../../contracts/tool-result.d.ts';
import RevenuePerEmployeeChip from './revenue-per-employee-chip';

export const companyColumns = ['详情', '名称', '等级', '国家', '人均年营收'];

type Props = {
  company: CompanyRow;
  expanded: boolean;
  onToggle: () => void;
  actions?: ReactNode;
};

export default function CompanyTableRow({ company, expanded, onToggle, actions }: Props) {
  const detailsId = useId();
  return <>
    <TableRow hover onClick={onToggle} sx={{ cursor: 'pointer' }}>
      <TableCell><Button size="small" aria-expanded={expanded} aria-controls={detailsId}
        aria-label={`${expanded ? '收起' : '展开'} ${company.companyName}`}>
        {expanded ? '收起' : '展开'}
      </Button></TableCell>
      <TableCell component="th" scope="row">{company.companyName || '未设置'}</TableCell>
      <TableCell>{company.level}</TableCell>
      <TableCell>{company.country || '未设置'}</TableCell>
      <TableCell><RevenuePerEmployeeChip value={company.revenuePerEmployee} /></TableCell>
      {actions && <TableCell onClick={event => event.stopPropagation()} sx={{ cursor: 'default' }}>{actions}</TableCell>}
    </TableRow>
    <TableRow id={detailsId} sx={{ display: expanded ? 'table-row' : 'none' }}>
      <TableCell colSpan={companyColumns.length + (actions ? 1 : 0)}>
        {expanded && <Stack spacing={0.5}>
          <Typography>城市：{company.city}</Typography>
          <Typography>成立年份：{company.foundedYear}</Typography>
          <Typography>年营收：{company.annualRevenue}</Typography>
          <Typography>员工数量：{company.employees}</Typography>
        </Stack>}
      </TableCell>
    </TableRow>
  </>;
}
