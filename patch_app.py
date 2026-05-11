import re

with open('frontend/src/App.tsx', 'r') as f:
    content = f.read()

# Add import
import_stmt = "import { MacroBuilderPage } from '@/pages/MacroBuilderPage';\n"
content = content.replace("import { WorkspacePage } from '@/pages/WorkspacePage';", "import { WorkspacePage } from '@/pages/WorkspacePage';\n" + import_stmt)

# Update routing block
routes_search = """  return (
    <Routes>
      <Route path="/" element={<WorkspacePage />} />
      <Route path="/workspace" element={<Navigate to="/" replace />} />
      <Route path="/debug" element={debugEnabled ? <DebugPage /> : <Navigate to="/" replace />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );"""

routes_replace = """  return (
    <Routes>
      <Route path="/" element={<WorkspacePage />} />
      <Route path="/workspace" element={<Navigate to="/" replace />} />
      <Route path="/macro-builder" element={<MacroBuilderPage />} />
      <Route path="/debug" element={debugEnabled ? <DebugPage /> : <Navigate to="/" replace />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );"""

content = content.replace(routes_search, routes_replace)

with open('frontend/src/App.tsx', 'w') as f:
    f.write(content)
