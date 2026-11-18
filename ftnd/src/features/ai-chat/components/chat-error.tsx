import { Alert, type AlertProps } from '@mui/material';

export default function ChatError({ children, sx }: Pick<AlertProps, 'children' | 'sx'>) {
  return <Alert severity="error" variant="outlined" sx={sx}>{children}</Alert>;
}
