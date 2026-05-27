-- V4 (1.2.0) Case-over-Const: pair -> constr 0 [fst, snd]
(program 1.2.0
    (case (con (pair integer integer) (3, 4))
        (lam x (lam y [(builtin addInteger) x y]))
    )
)
