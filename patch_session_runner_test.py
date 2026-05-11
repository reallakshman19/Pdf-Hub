import re

with open('frontend/src/core/macro/sessionRunner.slice12.test.ts', 'r') as f:
    content = f.read()

# Replace the viewState mock to match the actual interface
search = """      viewState: {
        currentPage: 1,
        zoom: 100,
        rotation: 0,
        panX: 0,
        panY: 0,
      },"""

replace = """      viewState: {
        currentPage: 1,
        zoom: 100,
        fitMode: 'width',
        viewMode: 'continuous',
      },"""

content = content.replace(search, replace)

with open('frontend/src/core/macro/sessionRunner.slice12.test.ts', 'w') as f:
    f.write(content)
