import Badge from '../ui/Badge'
import { STATUS_CONFIG } from '../../utils/constants'

export default function StatusBadge({ status }) {
  const cfg = STATUS_CONFIG[status] || { label: status, color: 'gray' }
  return <Badge color={cfg.color}>{cfg.label}</Badge>
}
