from pathlib import Path


path = Path("frontend/src/components/sidebar/panels/ThumbnailSidebar.tsx")
text = path.read_text()

old_state = """  const [imageUrl, setImageUrl] = React.useState<string | null>(null);\n\n  React.useEffect(() => {\n    const controller = new AbortController();\n    let release: (() => void) | null = null;\n    setImageUrl(null);\n"""
new_state = """  const requestKey = `${documentKey}:${pageNumber}`;\n  const [imageState, setImageState] = React.useState<{\n    requestKey: string;\n    imageUrl: string;\n  } | null>(null);\n  const imageUrl = imageState?.requestKey === requestKey\n    ? imageState.imageUrl\n    : null;\n\n  React.useEffect(() => {\n    const controller = new AbortController();\n    let release: (() => void) | null = null;\n"""

if old_state in text:
    text = text.replace(old_state, new_state, 1)
elif "const [imageState, setImageState]" not in text:
    raise RuntimeError("Could not locate thumbnail image state block")

text = text.replace(
    "      setImageUrl(lease.value.imageUrl);",
    "      setImageState({ requestKey, imageUrl: lease.value.imageUrl });",
    1,
)
text = text.replace("        setImageUrl(null);", "        setImageState(null);", 1)
text = text.replace(
    "  }, [doc, documentKey, pageNumber, currentPage]);",
    "  }, [doc, requestKey, pageNumber, currentPage]);",
    1,
)

path.write_text(text)
