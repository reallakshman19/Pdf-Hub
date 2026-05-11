import re

with open('frontend/src/pages/MacroBuilderPage.slice11.test.tsx', 'r') as f:
    content = f.read()

# Replace getByText queries that might return multiple elements
search1 = "expect(screen.getByText('draw_text_on_pages')).toBeInTheDocument();"
replace1 = "expect(screen.getAllByText('draw_text_on_pages')[0]).toBeInTheDocument();"
content = content.replace(search1, replace1)

search2 = "expect(screen.getByText('select_pages')).toBeInTheDocument();"
replace2 = "expect(screen.getAllByText('select_pages')[0]).toBeInTheDocument();"
content = content.replace(search2, replace2)

with open('frontend/src/pages/MacroBuilderPage.slice11.test.tsx', 'w') as f:
    f.write(content)
