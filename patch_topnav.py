import re

with open('frontend/src/components/shell/TopNav.tsx', 'r') as f:
    content = f.read()

# Update lucide import
content = content.replace("import { Moon, Search, Settings, Sun, TerminalSquare, X } from 'lucide-react';", "import { Moon, Search, Settings, Sun, TerminalSquare, Wand2, X } from 'lucide-react';")

# Add handler below handleOpenDebug
handler_search = """  const handleOpenDebug = () => {
    navigate('/debug');
  };"""

handler_replace = """  const handleOpenDebug = () => {
    navigate('/debug');
  };

  const handleOpenMacroBuilder = () => {
    navigate('/macro-builder');
  };"""

content = content.replace(handler_search, handler_replace)

# Add top-nav button before debug button
button_search = """        <Tooltip content="Open debug console">
          <Button
            variant="ghost"
            size="icon"
            onClick={handleOpenDebug}
            title="Debug Console"
          >
            <TerminalSquare className="w-4 h-4 text-slate-400 dark:text-slate-500" />
          </Button>
        </Tooltip>"""

button_replace = """        <Tooltip content="Open macro builder">
          <Button
            variant="ghost"
            size="icon"
            title="Macro Builder"
            onClick={handleOpenMacroBuilder}
          >
            <Wand2 className="w-4 h-4 text-slate-400 dark:text-slate-500" />
          </Button>
        </Tooltip>

        <Tooltip content="Open debug console">
          <Button
            variant="ghost"
            size="icon"
            onClick={handleOpenDebug}
            title="Debug Console"
          >
            <TerminalSquare className="w-4 h-4 text-slate-400 dark:text-slate-500" />
          </Button>
        </Tooltip>"""

content = content.replace(button_search, button_replace)

with open('frontend/src/components/shell/TopNav.tsx', 'w') as f:
    f.write(content)
