export interface CodeLine {
  prefix?: string;
  content: string;
  className?: string;
  style?: React.CSSProperties;
  spotlight?: boolean;
  delay?: number;
}
