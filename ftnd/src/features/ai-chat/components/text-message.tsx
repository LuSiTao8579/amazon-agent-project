import { Box } from '@mui/material';
import ReactMarkdown from 'react-markdown';
import type { TextMessage } from '../types';

/** 不执行模型生成的 HTML，也不自动加载外部图片。 */
export default function TextMessageView({ message }: { message: TextMessage }) {
  return <Box sx={{ fontSize: '0.875rem', lineHeight: 1.6, overflowWrap: 'anywhere',
    '& > :first-of-type': { mt: 0 }, '& > :last-child': { mb: 0 },
    '& p': { my: 1, whiteSpace: 'pre-wrap' }, '& h1, & h2, & h3, & h4, & h5, & h6': { my: 1, lineHeight: 1.3 },
    '& h1': { fontSize: '1.3rem' }, '& h2': { fontSize: '1.15rem' }, '& h3': { fontSize: '1rem' },
    '& ul, & ol': { pl: 3, my: 1 }, '& pre': { p: 1.5, borderRadius: 1, bgcolor: 'action.hover', overflowX: 'auto' },
    '& code': { fontFamily: 'monospace', fontSize: '0.85em' }, '& a': { color: 'inherit', textDecoration: 'underline' },
  }}>
    <ReactMarkdown skipHtml disallowedElements={['img']} components={{
      a: ({ href, children }) => href
        ? <a href={href} target="_blank" rel="noopener noreferrer">{children}</a>
        : <span>{children}</span>,
    }}>{message.content.text}</ReactMarkdown>
  </Box>;
}
