import re

with open('frontend/src/components/shell/TopNav.tsx', 'r') as f:
    content = f.read()

# Make sure the top nav button is actually added correctly
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
            onClick={handleOpenMacroBuilder}
            title="Macro Builder"
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

if "<Wand2" not in content:
    content = content.replace(button_search, button_replace)

with open('frontend/src/components/shell/TopNav.tsx', 'w') as f:
    f.write(content)
