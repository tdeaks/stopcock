# @stopcock/la

Linear algebra. Vectors and matrices.

```bash
bun add @stopcock/la
```

```ts
import { Vec, Mat } from '@stopcock/la'

const v = Vec.from([1, 2, 3])
Vec.dot(v, Vec.from([4, 5, 6])) // 32
Vec.normalize(v)
Vec.cross(Vec.from([1, 0, 0]), Vec.from([0, 1, 0])) // [0, 0, 1]

const m = Mat.identity(3)
Mat.multiply(m, Mat.from([[1, 2], [3, 4], [5, 6]]))
Mat.transpose(m)
Mat.determinant(m)
```

`Vec` and `Mat` namespaces cover creation, arithmetic, and decomposition.

[Docs](https://stopcock.dev/libraries/la)
