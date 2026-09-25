import tempfile, unittest
from pathlib import Path
import sys
sys.path.insert(0,str(Path(__file__).parents[1]))
from pipeline import adapt_seed,reproduce,semantic_oracle,run_case
R=Path(__file__).parents[1]
class T(unittest.TestCase):
 def test_A(self):
  c=adapt_seed(R/'seeds/case_A.json'); r=reproduce(c,R/'lab/case_A.json'); self.assertEqual(semantic_oracle(c,r)[0],'REPRODUCED')
 def test_B(self):
  c=adapt_seed(R/'seeds/case_B.json'); r=reproduce(c,R/'lab/case_B.json'); self.assertEqual(semantic_oracle(c,r)[0],'NOT_REPRODUCED')
 def test_C(self):
  c=adapt_seed(R/'seeds/case_C.json'); r=reproduce(c,R/'lab/case_C.json'); self.assertEqual(semantic_oracle(c,r)[0],'AMBIGUOUS')
 def test_only_A_regression(self):
  with tempfile.TemporaryDirectory() as d:
   a=run_case('A',R/'seeds/case_A.json',R/'lab/case_A.json',Path(d)); b=run_case('B',R/'seeds/case_B.json',R/'lab/case_B.json',Path(d)); c=run_case('C',R/'seeds/case_C.json',R/'lab/case_C.json',Path(d)); self.assertTrue(a['regression_generated']); self.assertFalse(b['regression_generated']); self.assertFalse(c['regression_generated'])
