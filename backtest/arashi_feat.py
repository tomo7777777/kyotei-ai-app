import numpy as np
from fe import FEATURES
FI = {f: i for i, f in enumerate(FEATURES)}
def eng(Xi):
    out = []
    for f in FEATURES:
        v = Xi[:, FI[f]]; out += [v[0] - np.median(v[1:]), v[1:].max() - v[0]]
    return np.array(out, dtype=np.float32)
def arashi_row(Xi):
    return np.concatenate([Xi.reshape(-1), eng(Xi)]).astype(np.float32)
