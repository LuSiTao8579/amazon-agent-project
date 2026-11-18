import { Chip } from '@mui/material';
import { revenuePerEmployeeDisplay } from './revenue-per-employee';

export default function RevenuePerEmployeeChip({ value }: { value: number | null }) {
  const { label, bgcolor } = revenuePerEmployeeDisplay(value);
  return <Chip label={label} sx={{ bgcolor }} />;
}
