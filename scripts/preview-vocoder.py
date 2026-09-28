"""CLI entry point for the original shared offline vocoder."""
import pathlib,runpy
runpy.run_path(str(pathlib.Path(__file__).resolve().parent.parent/'runtime/offline-vocoder.py'),run_name='__main__')
