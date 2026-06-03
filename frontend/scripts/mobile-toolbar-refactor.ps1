$utf8 = [System.Text.Encoding]::UTF8

# 1. Update CtxBar.tsx
$ctxBarPath = "c:\Code3\Pdf-Hub\frontend\src\components\shell\CtxBar.tsx"
$ctxBar = [System.IO.File]::ReadAllText($ctxBarPath, $utf8)

$ctxBarTarget = 'export const CtxBar: React.FC = () => {
  const { activeMode } = useEditorStore();

  return (
    <div className="flex items-center h-[34px] min-h-[34px] shrink-0 px-3 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-x-auto overflow-y-hidden [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">'

$ctxBarReplacement = 'export const CtxBar: React.FC = () => {
  const { activeMode } = useEditorStore();
  const isMobile = useIsMobile();

  return (
    <div
      className={[
        "flex items-center shrink-0 px-3 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-x-auto overflow-y-hidden [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
        isMobile ? "h-10 min-h-10" : "h-[34px] min-h-[34px]"
      ].join(" ")}
    >'

if ($ctxBar.Contains($ctxBarTarget)) {
    $ctxBar = $ctxBar.Replace($ctxBarTarget, $ctxBarReplacement)
    [System.IO.File]::WriteAllText($ctxBarPath, $ctxBar, $utf8)
    Write-Host "CtxBar.tsx updated successfully."
} else {
    Write-Host "CtxBar.tsx target not found or already replaced."
}
