// React 19 erwartet dieses Flag in der Testumgebung für act(...).
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
