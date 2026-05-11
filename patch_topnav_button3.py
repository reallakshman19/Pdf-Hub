import re

with open('frontend/src/components/shell/TopNav.tsx', 'r') as f:
    content = f.read()

# Add handler below handleOpenDebug
handler_search = """  const handleOpenDebug = () => {
    if (!debugEnabled) {
      addToast({
        type: 'info',
        title: 'Debug Console',
        message: 'Debug console is available only on local development hosts.',
      });
      return;
    }
    navigate('/debug');
  };"""

handler_replace = """  const handleOpenDebug = () => {
    if (!debugEnabled) {
      addToast({
        type: 'info',
        title: 'Debug Console',
        message: 'Debug console is available only on local development hosts.',
      });
      return;
    }
    navigate('/debug');
  };

  const handleOpenMacroBuilder = () => {
    navigate('/macro-builder');
  };"""

if "handleOpenMacroBuilder" not in content:
    content = content.replace(handler_search, handler_replace)

with open('frontend/src/components/shell/TopNav.tsx', 'w') as f:
    f.write(content)
