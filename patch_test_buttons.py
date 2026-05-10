import re

with open('frontend/src/components/macro/builder/MacroNestedBranchEditor.slice10.test.tsx', 'r') as f:
    content = f.read()

# Replace getByRole queries for nested step buttons
search1 = "getByRole('button', { name: 'Select Then step 1' })"
replace1 = "getByRole('button', { name: 'Select Then step 1' })"

content = content.replace("getByRole('button', { name: 'Select Then step 2' })", "getByRole('button', { name: 'Select Then step 1' })")
content = content.replace("getByRole('button', { name: 'Select Else step 2' })", "getByRole('button', { name: 'Select Else step 1' })")
content = content.replace("getByLabelText('Add Then Branch step')", "getByLabelText('Add Then Branch Step')")
content = content.replace("getByLabelText('Add Else Branch step')", "getByLabelText('Add Else Branch Step')")

with open('frontend/src/components/macro/builder/MacroNestedBranchEditor.slice10.test.tsx', 'w') as f:
    f.write(content)
