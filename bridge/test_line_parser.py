"""Checks the line parser. Run with: python -m unittest"""

import unittest

from line_parser import parse_line


class ParseLineTest(unittest.TestCase):
    def test_normal_line(self):
        self.assertEqual(parse_line("1,312,0,57"), {"id": 1, "gas": 312, "sos": False, "seq": 57})

    def test_windows_line_endings_and_spaces(self):
        self.assertEqual(parse_line(" 2, 640 ,1,9\r"), {"id": 2, "gas": 640, "sos": True, "seq": 9})

    def test_ignores_debug_text_and_broken_lines(self):
        for line in ["LED ON", "# warming up", "", "1,312,0", "1,abc,0,5", "1,312,2,5", "1,2,0,3,4"]:
            self.assertIsNone(parse_line(line), line)


if __name__ == "__main__":
    unittest.main()
