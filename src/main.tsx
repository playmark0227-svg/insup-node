import { createRoot } from "react-dom/client";
import NodeWorkspace from "../components/node-workspace";
import "../app/globals.css";

// GitHub Pages cannot send frame-ancestors, so refuse to render inside another site's frame.
let framed = true;
try { framed = window.top !== window.self; } catch { framed = true; }
if (framed) document.getElementById("root")!.textContent = "このページは埋め込み表示では利用できません。新しいタブで開いてください。";
else createRoot(document.getElementById("root")!).render(<NodeWorkspace />);
