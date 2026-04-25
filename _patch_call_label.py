# one-off: patch Call.js — read exact file content
from pathlib import Path

p = Path(__file__).parent / "app/client/ui/table/Call.js"
lines = p.read_text(encoding="utf-8").splitlines(keepends=True)
out = []
i = 0
while i < len(lines):
    line = lines[i]
    # assign handler: after data block, before } else {
    if (
        i + 3 < len(lines)
        and lines[i].strip() == "}"
        and "} else {" in lines[i + 1]
        and "customerCallLabelId" in lines[i + 2]
        and "setCustomerCallLabel(String(customer._id), labelCallId)" in "".join(out[-15:])
    ):
        out.append(line)  # closing } of inner if
        out.append("                    if (res.assigned) {\n")
        out.append("                        startTransition(() => router.refresh());\n")
        out.append("                    }\n")
        i += 1
        out.append(lines[i])  # } else {
        i += 1
        out.append("                    setCallLabelView(snapshot);\n")
        i += 1  # skip old setCallLabelView customerCallLabel
        continue
    # clear handler: add snapshot after if (!callLabelView.id)
    if line.strip() == "if (!callLabelView.id) return;" and i + 1 < len(lines) and "setLabelSavePending(true)" in lines[i + 1]:
        out.append(line)
        out.append("        const snapshot = { id: callLabelView.id, name: callLabelView.name };\n")
        i += 1
        continue
    if "setCallLabelView({ id: customerCallLabelId, name: customerCallLabelName });" in line and "handleClearCallLabel" in "".join(out[-30:]):
        out.append("                setCallLabelView(snapshot);\n")
        i += 1
        continue
    if "if (res.success) {" in line and i + 5 < len(lines) and "setCustomerCallLabel(String(customer._id), '')" in "".join(out[-8:]):
        # insert cleared refresh after toast.success block
        out.append(line)
        i += 1
        while i < len(lines) and lines[i].strip() != "} else {":
            out.append(lines[i])
            i += 1
        # before } else {, add if (res.cleared)
        out.append("                if (res.cleared) {\n")
        out.append("                    startTransition(() => router.refresh());\n")
        out.append("                }\n")
        continue
    if (
        "}, [customer?._id, labelSavePending, callLabelView.id, customerCallLabelId, customerCallLabelName]);" in line and "handleClearCallLabel" in "".join(out[-40:])
    ):
        out.append(
            "    }, [customer?._id, labelSavePending, callLabelView.id, callLabelView.name, router]);\n"
        )
        i += 1
        continue
    out.append(line)
    i += 1

p.write_text("".join(out), encoding="utf-8", newline="")
print("done lines", len(lines))
